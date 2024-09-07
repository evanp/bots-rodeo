export default class Bot {
  #context = null
  #username = null

  constructor (username) {
    this.#username = username
  }

  async initialize (context) {
    this.#context = context
  }

  get fullname () {
    return 'Bot'
  }

  get description () {
    return 'A default, do-nothing bot.'
  }

  get username () {
    return this.#username
  }

  get _context () {
    return this.#context
  }

  async onMention (object) {
    ; // no-op
  }

  async onFollow (actor) {
    ; // no-op
  }

  async onLike (object) {
    ; // no-op
  }

  async onAnnounce (object) {
    ; // no-op
  }
}
