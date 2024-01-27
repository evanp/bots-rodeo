import { promisify } from 'util'
import crypto from 'node:crypto'

const generateKeyPair = promisify(crypto.generateKeyPair)

export class KeyStorage {
  #connection = null

  constructor (connection) {
    this.#connection = connection
  }

  async initialize () {
    await this.#connection.query(`
            CREATE TABLE IF NOT EXISTS keys (
                bot_id TEXT PRIMARY KEY,
                public_key TEXT,
                private_key TEXT
            )
        `)
  }

  async getPublicKey (botId) {
    let publicKey = null
    const [result] = await this.#connection.query(`
          SELECT public_key FROM keys WHERE bot_id = ?
      `, [botId])
    if (result.length > 0) {
      publicKey = result[0].public_key
    } else {
      [publicKey] = await this.#newKeyPair(botId)
    }
    return publicKey
  }

  async getPrivateKey (botId) {
    let privateKey = null
    const [result] = await this.#connection.query(`
          SELECT private_key FROM keys WHERE bot_id = ?
      `, [botId])
    if (result.length > 0) {
      privateKey = result[0].private_key
    } else {
      [, privateKey] = await this.#newKeyPair(botId)
    }
    return privateKey
  }

  async #newKeyPair (botId) {
    const { publicKey, privateKey } = await generateKeyPair(
      'rsa',
      {
        modulusLength: 2048,
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        },
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        }
      }
    )
    await this.#connection.query(`
        INSERT INTO keys (bot_id, public_key, private_key) VALUES (?, ?, ?)
      `, [botId, publicKey, privateKey])
    return [publicKey, privateKey]
  }
}
