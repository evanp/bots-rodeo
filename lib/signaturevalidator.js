import createHttpError from 'http-errors'

export class HTTPSignature {
  #remoteKeyStorage = null
  constructor (remoteKeyStorage) {
    this.#remoteKeyStorage = remoteKeyStorage
  }

  async authenticate (req, res, next) {
    const signature = req.get('Signature')
    if (!signature) {
      // Just continue
      return next()
    }
    const parts = signature.split(',')
    const params = {}
    for (const part of parts) {
      const [key, value] = part.split('=')
      params[key] = value.replace(/"/g, '')
    }
    const keyId = params.keyId
    const algorithm = params.algorithm
    if (algorithm !== 'rsa-sha256') {
      return next(createHttpError(400, 'Unsupported algorithm'))
    }
    const headers = params.headers.split(' ')
    const signatureString = params.signature
    const signingString = headers.map(header => {
      if (header === '(request-target)') {
        return `(request-target): ${req.method.toLowerCase()} ${req.path}`
      }
      return `${header}: ${req.get(header)}`
    }).join('\n')
    const { publicKeyPem, owner } = await this.#remoteKeyStorage.getPublicKey(keyId)
    if (!publicKeyPem) {
      return next(createHttpError(401, 'Unauthorized'))
    }
    const verify = crypto.createVerify('sha256')
    verify.update(signingString)
    if (!verify.verify(publicKeyPem, signatureString, 'base64')) {
      return next(createHttpError(401, 'Unauthorized'))
    }
    req.auth = req.auth || {}
    req.auth.subject = owner
    next()
  }
}
