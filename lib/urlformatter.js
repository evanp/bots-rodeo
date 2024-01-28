import assert from 'assert'

export class UrlFormatter {
  #origin = null
  constructor (origin) {
    this.#origin = origin
  }

  format ({ username, type, nanoid, collection, page, server }) {
    let base = null
    if (server) {
      base = `${this.#origin}`
    } else if (username) {
      base = `${this.#origin}/user/${username}`
    } else {
      throw new Error('Cannot format URL without username or server')
    }
    let major = null
    if (type) {
      if (nanoid) {
        major = `${base}/${type}/${nanoid}`
      } else if (type === 'publickey') {
        major = `${base}/${type}`
      } else {
        throw new Error('Cannot format URL without nanoid')
      }
    } else {
      major = base
    }
    let url = null
    if (collection) {
      if (page) {
        url = `${major}/${collection}/page/${page}`
      } else {
        url = `${major}/${collection}`
      }
    } else {
      url = major
    }
    // For the base case, we want a trailing slash.
    if (url === this.#origin) {
      url = `${url}/`
    }
    return url
  }

  isLocal (url) {
    assert.equal(typeof url, 'string', 'url must be a string')
    return url.startsWith(this.#origin)
  }
}
