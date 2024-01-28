export class BotContext {
  #botId = null
  #botDataStorage = null
  #objectStorage = null
  #actorStorage = null
  #client = null
  #distributor = null

  get botId () {
    return this.#botId
  }

  constructor (botId, botDataStorage, objectStorage, actorStorage, client, distributor) {
    this.#botId = botId
    this.#botDataStorage = botDataStorage
    this.#objectStorage = objectStorage
    this.#actorStorage = actorStorage
    this.#client = client
    this.#distributor = distributor
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
}
