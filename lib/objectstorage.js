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
        const data = await this.#export(object)
        assert.ok(data, 'object is required')
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
        return await this.#import(data[0][0].data)
    }

    static async update (object) {
        assert.ok(this.#connection, 'ObjectStorage not initialized')
        assert.ok(object, 'object is required')
        assert.ok(object.id, 'object.id is required')
        const id = object.id
        const data = await this.#export(object)
        assert.ok(data, 'object is required')
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

    static async #export (object) {
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

    static async #import (data) {
        return await new Promise((resolve, reject) => {
            as2.import(JSON.parse(data), (err, object) => {
                if (err) {
                    reject(err)
                } else {
                    resolve(object)
                }
            })
        })
    }

}