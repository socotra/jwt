const decode = (jwt, idx) => JSON.parse(Buffer.from(jwt.split('.', 4)[idx], 'base64'))

const headers = (jwt) => decode(jwt, 0)
const inspect = (jwt) => {
  const claims = decode(jwt, 1)
  return {
    data: claims,
    metadata: headers(jwt),
    token: jwt,
  }
}

// TODO: verify
module.exports = {
  headers,
  inspect,
}
