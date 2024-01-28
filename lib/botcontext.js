import assert from 'node:assert'
import as2 from 'activitystrea.ms'
import { promisify } from 'node:util'
import { nanoid } from 'nanoid'

const as2import = promisify(as2.import)
const as2export = (obj) =>
  new Promise((resolve, reject) => {
    obj.export((err, doc) => {
      if (err) {
        reject(err)
      } else {
        resolve(doc)
      }
    })
  })

export class BotContext {
  #botId = null
  #botDataStorage = null
  #objectStorage = null
  #actorStorage = null
  #client = null
  #distributor = null
  #formatter = null

  get botId () {
    return this.#botId
  }

  constructor (botId, botDataStorage, objectStorage, actorStorage, client, distributor, formatter) {
    this.#botId = botId
    this.#botDataStorage = botDataStorage
    this.#objectStorage = objectStorage
    this.#actorStorage = actorStorage
    this.#client = client
    this.#distributor = distributor
    this.#formatter = formatter
  }

  async setData (key, value) {
    await this.#botDataStorage.set(this.#botId, key, value)
  }

  async getData (key) {
    return await this.#botDataStorage.get(this.#botId, key)
  }

  async deleteData (key) {
    await this.#botDataStorage.delete(this.#botId, key)
  }

  async getObject (id) {
    assert.ok(id)
    assert.equal(typeof id, 'string')
    if (this.#formatter.isLocal(id)) {
      return await this.#objectStorage.read(id)
    } else {
      return await this.#client.get(id, this.#botId)
    }
  }

  async sendNote (content, { to, cc, bto, bcc, audience, inReplyTo }) {
    assert.ok(content)
    assert.equal(typeof content, 'string')
    assert.ok(to || cc || bto || bcc || audience)
    const note = await as2import({
      type: 'Note',
      content,
      to,
      cc,
      bto,
      bcc,
      audience,
      inReplyTo,
      id: this.#formatter.format({ username: this.#botId, type: 'note', nanoid: nanoid() }),
      published: new Date().toISOString(),
      attributedTo: this.#formatter.format({ username: this.#botId })
    })
    await this.#objectStorage.create(note)
    const activity = await as2import({
      type: 'Create',
      id: this.#formatter.format({ username: this.#botId, type: 'create', nanoid: nanoid() }),
      actor: this.#formatter.format({ username: this.#botId }),
      to,
      cc,
      bto,
      bcc,
      audience,
      object: note
    })
    await this.#objectStorage.create(activity)
    await this.#actorStorage.addToCollection(this.#botId, 'outbox', activity)
    await this.#actorStorage.addToCollection(this.#botId, 'inbox', activity)
    await this.#distributor.distribute(activity, this.#botId)
    return note
  }

  async likeObject (obj) {
    assert.ok(obj)
    assert.equal(typeof obj, 'object')
    const owners = (obj.attributedTo)
      ? Array.from(obj.attributedTo).map((owner) => owner.id)
      : Array.from(obj.actor).map((owner) => owner.id)
    const activity = await as2import({
      type: 'Like',
      id: this.#formatter.format({ username: this.#botId, type: 'like', nanoid: nanoid() }),
      actor: this.#formatter.format({ username: this.#botId }),
      object: obj.id,
      to: owners,
      cc: 'https://www.w3.org/ns/activitystreams#Public'
    })
    await this.#objectStorage.create(activity)
    await this.#actorStorage.addToCollection(this.#botId, 'outbox', activity)
    await this.#actorStorage.addToCollection(this.#botId, 'inbox', activity)
    await this.#actorStorage.addToCollection(this.#botId, 'liked', obj)
    await this.#distributor.distribute(activity, this.#botId)
    return activity
  }

  async unlikeObject (obj) {
    assert.ok(obj)
    assert.equal(typeof obj, 'object')
    const owners = (obj.attributedTo)
      ? Array.from(obj.attributedTo).map((owner) => owner.id)
      : Array.from(obj.actor).map((owner) => owner.id)
    const likeActivity = this.#findInOutbox('Like', obj)
    if (!likeActivity) {
      throw new Error('no like activity')
    }
    const undoActivity = await as2import({
      type: 'Undo',
      id: this.#formatter.format({ username: this.#botId, type: 'undo', nanoid: nanoid() }),
      actor: this.#formatter.format({ username: this.#botId }),
      object: likeActivity,
      to: owners,
      cc: 'https://www.w3.org/ns/activitystreams#Public'
    })
    await this.#objectStorage.create(undoActivity)
    await this.#actorStorage.addToCollection(this.#botId, 'outbox', undoActivity)
    await this.#actorStorage.addToCollection(this.#botId, 'inbox', undoActivity)
    await this.#actorStorage.removeFromCollection(this.#botId, 'liked', obj)
    await this.#distributor.distribute(undoActivity, this.#botId)
    return undoActivity
  }

  async #findInOutbox (type, obj) {
    const full = `https://www.w3.org/ns/activitystreams#${type}`
    let found = null
    for await (const activity of this.#actorStorage.items(this.#botId, 'outbox')) {
      if (activity.type === full && activity.object.id === obj.id) {
        found = activity
        break
      }
    }
    return found
  }
}
