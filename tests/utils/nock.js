import as2 from 'activitystrea.ms'
import nock from 'nock'

export const makeActor = (username, domain = 'social.example') =>
  as2.import({
    id: `https://${domain}/user/${username}`,
    type: 'Person',
    preferredUsername: username,
    inbox: `https://${domain}/user/${username}/inbox`,
    outbox: `https://${domain}/user/${username}/outbox`,
    followers: `https://${domain}/user/${username}/followers`,
    following: `https://${domain}/user/${username}/following`,
    liked: `https://${domain}/user/${username}/liked`,
    to: ['as:Public']
  })

// Just the types we use here
const isActivityType = (type) => ['Create', 'Update', 'Delete', 'Add', 'Remove', 'Follow', 'Accept', 'Reject', 'Like', 'Block', 'Flag', 'Undo'].includes(uppercase(type))

export const makeObject = (username, type, num, domain = 'social.example') =>
  as2.import({
    id: nockFormat({ username, type, num, domain }),
    type: uppercase(type),
    to: 'as:Public',
    actor: (isActivityType(type) ? nockFormat({ username, domain }) : undefined),
    attributedTo: (isActivityType(type) ? undefined : nockFormat({ username, domain }))
  })

export const makeTransitive = (username, type, num, obj, domain = 'social.example') =>
  as2.import({
    id: nockFormat({ username, type, num, obj, domain }),
    type: uppercase(type),
    to: 'as:Public',
    actor: nockFormat({ username, domain }),
    object: `https://${obj}`
  })

const uppercase = (str) => str.charAt(0).toUpperCase() + str.slice(1)

export const postInbox = {}

export const nockSetup = (domain) =>
  nock(`https://${domain}`)
    .get(/^\/user\/(\w+)$/)
    .reply(async (uri, requestBody) => {
      const username = uri.match(/^\/user\/(\w+)$/)[1]
      const actor = await makeActor(username, domain)
      const actorText = await actor.write()
      return [200, actorText, { 'Content-Type': 'application/activity+json' }]
    })
    .persist()
    .post(/^\/user\/(\w+)\/inbox$/)
    .reply(async (uri, requestBody) => {
      const username = uri.match(/^\/user\/(\w+)\/inbox$/)[1]
      if (username in postInbox) {
        postInbox[username] += 1
      } else {
        postInbox[username] = 1
      }
      return [202, 'accepted']
    })
    .persist()
    .get(/^\/user\/(\w+)\/(\w+)\/(\d+)$/)
    .reply(async (uri, requestBody) => {
      const match = uri.match(/^\/user\/(\w+)\/(\w+)\/(\d+)$/)
      const username = match[1]
      const type = uppercase(match[2])
      const num = match[3]
      const obj = await makeObject(username, type, num, domain)
      const objText = await obj.write()
      return [200, objText, { 'Content-Type': 'application/activity+json' }]
    })
    .get(/^\/user\/(\w+)\/(\w+)\/(\d+)\/(.*)$/)
    .reply(async (uri, requestBody) => {
      const match = uri.match(/^\/user\/(\w+)\/(\w+)\/(\d+)\/(.*)$/)
      const username = match[1]
      const type = match[2]
      const num = match[3]
      const obj = match[4]
      const act = await makeTransitive(username, type, num, obj, domain)
      const actText = await act.write()
      return [200, actText, { 'Content-Type': 'application/activity+json' }]
    })

export function nockFormat ({ username, type, num, obj, domain = 'social.example' }) {
  let url = `https://${domain}/user/${username}`
  if (type && num) {
    url = `${url}/${type}/${num}`
    if (obj) {
      if (obj.startsWith('https://')) {
        url = `${url}/${obj.slice(8)}`
      } else {
        url = `${url}/${obj}`
      }
    }
  }
  return url
}
