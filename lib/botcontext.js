import assert from 'node:assert'

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
}
