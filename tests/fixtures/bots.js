import Bot from '../../lib/bot.js'

class OKBot extends Bot {
  get fullname () {
    return 'OK Bot'
  }

  get description () {
    return 'A bot that says "OK" when mentioned.'
  }

  async onMention (object) {
    await this._context.sendNote('OK', { to: object.attributedTo })
  }
}

export default {
  ok: new OKBot()
}
