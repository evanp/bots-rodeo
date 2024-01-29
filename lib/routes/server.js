import express from 'express'
import as2 from 'activitystrea.ms'

const router = express.Router()

router.get('/', async (req, res) => {
  const { formatter } = req.app.locals
  const server = await as2.import({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    id: formatter.format({ server: true }),
    type: 'Service',
    publicKey: formatter.format({ server: true, type: 'publickey' })
  })
  res.status(200)
  res.type(as2.mediaType)
  res.end(await server.prettyWrite())
})

router.get('/publickey', async (req, res) => {
  const { formatter, keyStorage } = req.app.locals
  const publicKeyPem = await keyStorage.getPublicKey(null)
  const publicKey = await as2.import({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    publicKeyPem,
    id: formatter.format({ server: true, type: 'publickey' }),
    owner: formatter.format({ server: true }),
    type: 'PublicKey',
    to: 'https://www.w3.org/ns/activitystreams#Public'
  })
  res.status(200)
  res.type(as2.mediaType)
  res.end(await publicKey.prettyWrite())
})

export default router
