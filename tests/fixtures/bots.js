class OKBot {
  #context = null

  get fullname () {
    return 'OK Bot'
  }

  get description () {
    return 'A bot that says "OK" when mentioned.'
  }

  async initialize (context) {
    this.#context = context
  }

  async onMention (object) {
    await this.#context.sendNote('OK', { to: object.attributedTo })
  }
}

export default {
  ok: new OKBot()
}
