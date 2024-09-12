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

  async onMention (object, activity) {
    ; // no-op
  }

  async onFollow (actor, activity) {
    ; // no-op
  }

  async onLike (object, activity) {
    ; // no-op
  }

  async onAnnounce (object, activity) {
    ; // no-op
  }
}
