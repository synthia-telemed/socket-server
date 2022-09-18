import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { parseENV } from './env'
import { RedisClient } from './redis'

const env = parseENV()

const app = express()
const server = http.createServer(app)
const io = new Server(server)
const PORT = 3000 || process.env.PORT

app.get('/healthcheck', (req, res) => {
	res.send({
		success: true,
		timestamp: new Date().toISOString(),
	})
})
const redis = new RedisClient(env.RedisHost, env.Port, env.RedisUsername, env.RedisPassword)

server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
