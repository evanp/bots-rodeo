import Bot from '../../lib/bot.js'

class OKBot extends Bot {
  get fullname () {
    return 'OK Bot'
  }

  get description () {
    return 'A bot that says "OK" when mentioned.'
  }

  async onMention (object, activity) {
    const attributedTo =
      object.attributedTo?.first.id ||
      activity.actor?.first.id
    await this._context.sendNote('OK', { to: attributedTo })
  }
}

export default {
  ok: new OKBot('ok')
}
