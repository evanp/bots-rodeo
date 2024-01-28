import assert from 'node:assert'

const exp = function (obj) {
  return new Promise((resolve, reject) => {
    obj.export((err, doc) => {
      if (err) {
        reject(err)
      } else {
        resolve(doc)
      }
    })
  })
}

export class ActivityDistributor {
  #client = null
  #formatter = null
  #actorStorage = null
  constructor (client, formatter, actorStorage) {
    this.#client = client
    this.#formatter = formatter
    this.#actorStorage = actorStorage
  }

  async distribute (activity, username) {
    const recipientIds = this.#getRecipientIds(activity)

    const inboxes = await this.#getInboxes(recipientIds, username)

    await Promise.all(Array.from(inboxes).map(async (inbox) => {
      await this.#client.post(inbox, activity, username)
    }))
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
    const obj = await this.#client.get(actorId, username)
    if (!obj) {
      throw new Error(`no actor ${actorId}`)
    }
    if (!obj.inbox) {
      throw new Error(`no inbox for actor ${actorId}`)
    }
    const inboxes = Array.from(obj.inbox)
    if (inboxes.length === 0) {
      throw new Error('no inbox')
    }
    return inboxes[0].id
  }
}