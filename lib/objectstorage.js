import { Sequelize } from "sequelize"
import assert from 'node:assert'
import as2 from 'activitystrea.ms'

export class NoSuchObjectError extends Error {
    constructor (id) {
        const message = `No such object: ${id}`
        super(message)
        this.name = 'NoSuchObjectError'
    }
}

export class ObjectStorage {

    static #connection = null
    static #url = null

    static async initialize (url) {
        this.#url = url
        this.#connection = new Sequelize(url, {logging: false})
        await this.#connection.authenticate()
        await this.#connection.query(`
            CREATE TABLE IF NOT EXISTS objects (
                id VARCHAR(512) PRIMARY KEY,
                data TEXT NOT NULL
            )
        `)
        await this.#connection.query(`
            CREATE TABLE IF NOT EXISTS collections (
                id VARCHAR(512) NOT NULL,
                property VARCHAR(512) NOT NULL,
                totalItems INTEGER NOT NULL,
                first VARCHAR(512) NOT NULL,
                PRIMARY KEY (id, property)
            )
        `)
        await this.#connection.query(`
            CREATE TABLE IF NOT EXISTS pages (
                id VARCHAR(512) NOT NULL,
                property VARCHAR(512) NOT NULL,
                item VARCHAR(512) NOT NULL,
                page INTEGER NOT NULL,
                PRIMARY KEY (id, property, item)
            )
        `)
    }

    static async terminate () {
        await this.#connection.close()
        this.#connection = null
        this.#url = null
    }

    static async create (object) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(object, 'object is required')
        assert.ok(object.id, 'object.id is required')
        const id = object.id
        const data = await this.#write(object)
        assert.ok(data, 'object is required')
        assert.ok(typeof data === 'string', 'data must be a string')
        await this.#connection.query(
            'INSERT INTO objects (id, data) VALUES (?, ?)',
            { replacements: [id, data] })
    }

    static async read (id) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(id, 'id is required')
        const data = await this.#connection.query(
            'SELECT data FROM objects WHERE id = ?',
            { replacements: [id] })
        if (data[0].length === 0) {
            throw new NoSuchObjectError(id)
        }
        return await this.#import(JSON.parse(data[0][0].data))
    }

    static async update (object) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(object, 'object is required')
        assert.ok(object.id, 'object.id is required')
        const id = object.id
        const data = await this.#write(object)
        assert.ok(data, 'object is required')
        assert.ok(typeof data === 'string', 'data must be a string')
        await this.#connection.query(
            'UPDATE objects SET data = ? WHERE id = ?',
            { replacements: [data, id] })
    }

    static async delete (object) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(object, 'object is required')
        assert.ok(object.id, 'object.id is required')
        const id = object.id
        await this.#connection.query(
            'DELETE FROM objects WHERE id = ?',
            { replacements: [id] })
    }

    static async #collectionInfo (id, property) {
        assert.ok(id, 'id is required')
        assert.equal(typeof id, 'string', 'id must be a string')
        assert.ok(property, 'property is required')
        assert.equal(typeof property, 'string', 'property must be a string')
        let totalItems = 0
        let first = 1
        const row = await this.#connection.query(
            'SELECT totalItems, first FROM collections WHERE id = ? AND property = ?',
            { replacements: [id, property] })
        if (row[0].length > 0) {
            totalItems = row[0][0].totalItems
            first = row[0][0].first
        }
        assert.equal(typeof totalItems, 'number', 'totalItems must be a number')
        assert.ok(totalItems >= 0, 'totalItems must be greater than or equal to 0')
        assert.equal(typeof first, 'number', 'first must be a number')
        assert.ok(first >= 1, 'first must be greater than or equal to 1')
        return [totalItems, first]
    }

    static async getCollection (id, property) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(id, 'id is required')
        assert.ok(property, 'property is required')
        let [totalItems, first] = await this.#collectionInfo(id, property)
        const collection = await this.#import({
            id: `${id}/${property}`,
            type: 'OrderedCollection',
            totalItems: totalItems,
            first: `${id}/${property}/page/${first}`,
            last: `${id}/${property}/page/1`
        })
        assert.ok(collection, 'collection is required')
        assert.equal(typeof collection, 'object', 'collection must be an object')
        return collection
    }

    static async getCollectionPage (id, property, page) {

        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(id, 'id is required')
        assert.equal(typeof id, 'string', 'id must be a string')
        assert.ok(property, 'property is required')
        assert.equal(typeof property, 'string', 'property must be a string')
        assert.ok(page, 'pageNo is required')
        assert.equal(typeof page, 'number', 'page must be a number')
        assert.ok(page >= 1, 'page must be greater than or equal to 1')

        let [totalItems, first] = await this.#collectionInfo(id, property)

        if (page > first) {
            throw new NoSuchObjectError(`${id}/${property}/page/${page}`)
        }

        let items = []

        const rows = await this.#connection.query(
            'SELECT item FROM pages WHERE id = ? AND property = ? and page = ?',
            { replacements: [id, property, page] })

        if (rows[0].length > 0) {
            items = rows[0].map(row => row.item)
        }

        const pageObject = await this.#import({
            id: `${id}/${property}/page/${page}`,
            type: 'OrderedCollectionPage',
            partOf: `${id}/${property}`,
            next: (page === 1) ? null : `${id}/${property}/page/${page - 1}`,
            prev: (page === first) ? null : `${id}/${property}/page/${page + 1}`,
            items: items
        })

        assert.ok(pageObject, 'collection is required')
        assert.equal(typeof pageObject, 'object', 'collection must be an object')

        return pageObject
    }

    static async #export (object) {
        return await new Promise((resolve, reject) => {
            object.export((err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }

    static async #import (json) {
        assert.ok(json, 'json is required')
        assert.ok(typeof json === 'object', 'json must be an object')
        return await new Promise((resolve, reject) => {
            as2.import(json, (err, object) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(object)
                }
            })
        })
    }

    static async #write (object) {
        assert.ok(object, 'object is required')
        assert.ok(typeof object === 'object', 'object must be an object')
        return await new Promise((resolve, reject) => {
            object.write((err, data) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(data)
                }
            })
        })
    }
}