import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { parseENV } from './env'
import { RedisClient } from './redis'

const env = parseENV()
const redis = new RedisClient(env.RedisHost, env.RedisPort, env.RedisUsername, env.RedisPassword)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: ['localhost:3000'],
		credentials: true,
	},
})
const PORT = 3000 || process.env.PORT

app.get('/healthcheck', (req, res) => {
	res.send({
		success: true,
		timestamp: new Date().toISOString(),
	})
})

io.on('connection', socket => {
	console.log(socket.id, 'handshake header', socket.handshake.headers)

	socket.on('join-room', () => {
		console.log(socket.id, 'on event header', socket.request.headers)
	})
})

server.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
