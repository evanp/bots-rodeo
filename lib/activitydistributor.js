import assert from 'node:assert'
import as2 from 'activitystrea.ms'
import { LRUCache } from 'lru-cache'
import PQueue from 'p-queue'
import { setTimeout } from 'node:timers/promises'

export class ActivityDistributor {
  static #MAX_CACHE_SIZE = 1000000
  static #CONCURRENCY = 4
  static #MAX_ATTEMPTS = 16
  #client = null
  #formatter = null
  #actorStorage = null
  #directInboxCache = null
  #sharedInboxCache = null
  #queue = null
  #retryQueue = null

  constructor (client, formatter, actorStorage) {
    this.#client = client
    this.#formatter = formatter
    this.#actorStorage = actorStorage
    this.#directInboxCache = new LRUCache({ max: ActivityDistributor.#MAX_CACHE_SIZE })
    this.#sharedInboxCache = new LRUCache({ max: ActivityDistributor.#MAX_CACHE_SIZE })
    this.#queue = new PQueue({ concurrency: ActivityDistributor.#CONCURRENCY })
    this.#retryQueue = new PQueue()
  }

  async distribute (activity, username) {
    const publicRecipients = this.#getPublicRecipients(activity)
    const privateRecipients = this.#getPrivateRecipients(activity)

    const publicInboxes = await this.#getInboxes(publicRecipients, username)
    const privateInboxes = await this.#getDirectInboxes(privateRecipients, username)

    const stripped = await this.#strip(activity)

    Array.from(publicInboxes).forEach((inbox) =>
      this.#queue.add(() =>
        this.#deliver(inbox, stripped, username)
      )
    )

    Array.from(privateInboxes).forEach((inbox) =>
      this.#queue.add(() =>
        this.#deliver(inbox, stripped, username)
      )
    )
  }

  async onIdle () {
    await this.#retryQueue.onIdle()
    await this.#queue.onIdle()
  }

  #getPublicRecipients (activity) {
    const recipientIds = new Set()
    if (activity.to) {
      for (const to of activity.to) {
        recipientIds.add(to.id)
      }
    }
    if (activity.cc) {
      for (const cc of activity.cc) {
        recipientIds.add(cc.id)
      }
    }
    if (activity.audience) {
      for (const audience of activity.audience) {
        recipientIds.add(audience.id)
      }
    }
    return recipientIds
  }

  #getPrivateRecipients (activity) {
    const recipientIds = new Set()
    if (activity.bto) {
      for (const bto of activity.bto) {
        recipientIds.add(bto.id)
      }
    }
    if (activity.bcc) {
      for (const bcc of activity.bcc) {
        recipientIds.add(bcc.id)
      }
    }
    return recipientIds
  }

  async #getInboxes (recipientIds, username) {
    const inboxes = new Set()
    const followers = this.#formatter.format({ username, collection: 'followers' })

    for (const recipientId of recipientIds) {
      if (recipientId === followers || ['https://www.w3.org/ns/activitystreams#Public', 'as:Public', 'Public'].includes(recipientId)) {
        for await (const follower of this.#actorStorage.items(username, 'followers')) {
          const inbox = await this.#getInbox(follower.id, username)
          inboxes.add(inbox)
        }
      } else {
        const inbox = await this.#getInbox(recipientId, username)
        inboxes.add(inbox)
      }
    }
    return inboxes
  }

  async #getDirectInboxes (recipientIds, username) {
    const inboxes = new Set()
    const followers = this.#formatter.format({ username, collection: 'followers' })

    for (const recipientId of recipientIds) {
      if (recipientId === followers || ['https://www.w3.org/ns/activitystreams#Public', 'as:Public', 'Public'].includes(recipientId)) {
        for await (const follower of this.#actorStorage.items(username, 'followers')) {
          const inbox = await this.#getDirectInbox(follower.id, username)
          inboxes.add(inbox)
        }
      } else {
        const inbox = await this.#getDirectInbox(recipientId, username)
        inboxes.add(inbox)
      }
    }
    return inboxes
  }

  async #getInbox (actorId, username) {
    assert.ok(actorId)
    assert.equal(typeof actorId, 'string')
    assert.ok(username)
    assert.equal(typeof username, 'string')

    let sharedInbox = this.#sharedInboxCache.get(actorId)

    if (sharedInbox) {
      return sharedInbox
    }

    const obj = await this.#client.get(actorId, username)

    // Get the shared inbox if it exists

    const endpoints = obj.get('endpoints')
    if (endpoints) {
      const firstEndpoint = Array.from(endpoints)[0]
      const sharedInboxEndpoint = firstEndpoint.get('sharedInbox')
      if (sharedInboxEndpoint) {
        const firstSharedInbox = Array.from(sharedInboxEndpoint)[0]
        sharedInbox = firstSharedInbox.id
        this.#sharedInboxCache.set(actorId, sharedInbox)
        return sharedInbox
      }
    }

    let directInbox = this.#directInboxCache.get(actorId)
    if (directInbox) {
      return directInbox
    }

    if (!obj.inbox) {
      throw new Error(`no inbox for actor ${actorId}`)
    }
    const inboxes = Array.from(obj.inbox)
    if (inboxes.length === 0) {
      throw new Error('no inbox')
    }
    directInbox = inboxes[0].id
    this.#directInboxCache.set(actorId, directInbox)
    return directInbox
  }

  async #getDirectInbox (actorId, username) {
    assert.ok(actorId)
    assert.equal(typeof actorId, 'string')
    assert.ok(username)
    assert.equal(typeof username, 'string')
    let directInbox = this.#directInboxCache.get(actorId)
    if (directInbox) {
      return directInbox
    }

    const obj = await this.#client.get(actorId, username)

    if (!obj.inbox) {
      throw new Error(`no inbox for actor ${actorId}`)
    }
    const inboxes = Array.from(obj.inbox)
    if (inboxes.length === 0) {
      throw new Error('no inbox')
    }
    directInbox = inboxes[0].id
    this.#directInboxCache.set(actorId, directInbox)
    return directInbox
  }

  async #strip (activity) {
    const exported = await activity.export()
    delete exported.bcc
    delete exported.bto
    return await as2.import(exported)
  }

  async #deliver (inbox, activity, username, attempt = 1) {
    try {
      await this.#client.post(inbox, activity, username)
      this.#logInfo(`Delivered ${activity.id} to ${inbox}`)
    } catch (error) {
      if (!error.status) {
        this.#logError(`Could not deliver ${activity.id} to ${inbox}: ${error.message}`)
      } else if (error.status >= 300 && error.status < 400) {
        this.#logError(`Unexpected redirect code delivering ${activity.id} to ${inbox}: ${error.status} ${error.message}`)
      } else if (error.status >= 400 && error.status < 500) {
        this.#logError(`Bad request delivering ${activity.id} to ${inbox}: ${error.status} ${error.message}`)
      } else if (error.status >= 500 && error.status < 600) {
        if (attempt >= ActivityDistributor.#MAX_ATTEMPTS) {
          this.#logError(`Server error delivering ${activity.id} to ${inbox}: ${error.status} ${error.message}; giving up after ${attempt} attempts`)
        }
        const delay = Math.round((2 ** (attempt - 1) * 1000) * (0.5 + Math.random()))
        this.#logWarning(`Server error delivering ${activity.id} to ${inbox}: ${error.status} ${error.message}; will retry in ${delay} ms (${attempt} of ${ActivityDistributor.#MAX_ATTEMPTS})`)
        this.#retryQueue.add(() => setTimeout(delay).then(() => this.#deliver(inbox, activity, username, attempt + 1)))
      }
    }
  }

  #logError (message) {
    if (process.env.NODE_ENV in ['development', 'production']) {
      console.error(message)
    }
  }

  #logWarning (message) {
    if (process.env.NODE_ENV in ['development', 'production']) {
      console.warn(message)
    }
  }

  #logInfo (message) {
    if (process.env.NODE_ENV in ['development', 'production']) {
      console.info(message)
    }
  }
}
