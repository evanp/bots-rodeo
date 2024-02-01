import assert from 'node:assert'
import as2 from 'activitystrea.ms'
import { LRUCache } from 'lru-cache'

export class ActivityDistributor {
  #client = null
  #formatter = null
  #actorStorage = null
  static #MAX_CACHE_SIZE = 1000000
  #cache = null

  constructor (client, formatter, actorStorage) {
    this.#client = client
    this.#formatter = formatter
    this.#actorStorage = actorStorage
    this.#cache = new LRUCache({ max: ActivityDistributor.#MAX_CACHE_SIZE })
  }

  async distribute (activity, username) {
    const recipientIds = this.#getRecipientIds(activity)

    const inboxes = await this.#getInboxes(recipientIds, username)

    const stripped = await this.#strip(activity)

    await Promise.all(Array.from(inboxes).map((inbox) =>
      this.#client.post(inbox, stripped, username)
    ))
  }

  #getRecipientIds (activity) {
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
    if (activity.audience) {
      for (const audience of activity.audience) {
        recipientIds.add(audience.id)
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

  async #getInbox (actorId, username) {
    assert.ok(actorId)
    assert.equal(typeof actorId, 'string')
    assert.ok(username)
    assert.equal(typeof username, 'string')
    const cached = this.#cache.get(actorId)
    if (cached) {
      return cached
    }
    const obj = await this.#client.get(actorId, username)
    if (!obj) {
      throw new Error(`no actor ${actorId}`)
    }
    // Get the shared inbox if it exists

    const endpoints = obj.get('endpoints')
    if (endpoints) {
      const firstEndpoint = Array.from(endpoints)[0]
      const sharedInbox = firstEndpoint.get('sharedInbox')
      if (sharedInbox) {
        const firstSharedInbox = Array.from(sharedInbox)[0]
        this.#cache.set(actorId, firstSharedInbox.id)
        return firstSharedInbox.id
      }
    }
    // Otherwise, get the individual inbox
    if (!obj.inbox) {
      throw new Error(`no inbox for actor ${actorId}`)
    }
    const inboxes = Array.from(obj.inbox)
    if (inboxes.length === 0) {
      throw new Error('no inbox')
    }
    this.#cache.set(actorId, inboxes[0].id)
    return inboxes[0].id
  }

  async #strip (activity) {
    const exported = await activity.export()
    delete exported.bcc
    delete exported.bto
    return await as2.import(exported)
  }
}
