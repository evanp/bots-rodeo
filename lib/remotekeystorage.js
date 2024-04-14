export class RemoteKeyStorage {
  #client = null
  #connection = null

  constructor (client, connection) {
    this.#client = client
    this.#connection = connection
  }

  async initialize () {
    await this.#connection.query(
      `CREATE TABLE IF NOT EXISTS remotekeys (
        id TEXT PRIMARY KEY,
        owner TEXT,
        publicKeyPem TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    )
  }

  async getPublicKey (id) {
    const cached = await this.#getCachedPublicKey(id)
    if (cached) {
      return cached
    }
    const remote = await this.#getRemotePublicKey(id)
    if (!remote) {
      return null
    }
    await this.#cachePublicKey(id, remote.owner, remote.publicKeyPem)
    return remote
  }

  async #getCachedPublicKey (id) {
    const [result] = await this.#connection.query(
      'SELECT publicKeyPem, owner FROM remotekeys WHERE id = ?',
      [id]
    )
    if (result.length > 0) {
      return {
        publicKeyPem: result[0].publicKeyPem,
        owner: result[0].owner
      }
    } else {
      return null
    }
  }

  async #getRemotePublicKey (id) {
    const response = await this.#client.get(id)
    if (!response) {
      return null
    }
    let owner = null
    let publicKeyPem = null
    if (response.type === 'https://w3c.id/security/v1#publicKey') {
      owner = response.owner.id
      publicKeyPem = response.publicKeyPem
    } else if (response.publicKey) {
      owner = response.publicKey.owner
      publicKeyPem = response.publicKey.publicKeyPem
    }
    if (!owner || !publicKeyPem) {
      return null
    }
    return { owner, publicKeyPem }
  }

  async #cachePublicKey (id, owner, publicKeyPem) {
    await this.#connection.query(
      'INSERT INTO remotekeys (id, owner, publicKeyPem) VALUES (?, ?, ?)',
      [id, owner, publicKeyPem]
    )
  }
}
