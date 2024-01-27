export class BotContext {
  constructor (botId, botDataStorage, objectStorage) {
    this.botId = botId
    this.botDataStorage = botDataStorage
    this.objectStorage = objectStorage
  }

  async setData (key, value) {
    await this.botDataStorage.set(this.botId, key, value)
  }

  async getData (key) {
    return await this.botDataStorage.get(this.botId, key)
  }

  async deleteData (key) {
    await this.botDataStorage.delete(this.botId, key)
  }
}
