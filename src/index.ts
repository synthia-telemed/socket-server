import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import { HeimdallClient, UserInfo } from './api/heimdall'
import { parseENV } from './env'
import { RedisClient, RoomInfoField, SocketClientInfoField } from './redis/redis'

const env = parseENV()
const redis = new RedisClient(env.RedisHost, env.RedisPort, env.RedisUsername, env.RedisPassword)
const heimdallClient = new HeimdallClient(env.HeimdallEndpoint)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: ['http://localhost:3000'],
	},
})

app.get('/healthcheck', (req, res) => {
	res.send({
		success: true,
		timestamp: new Date().toISOString(),
	})
})

io.use(async (socket, next) => {
	const token = socket.handshake.auth.token
	if (!token) next(new Error('Auth token is not found'))
	try {
		const userInfo = await heimdallClient.parseToken(token)
		await redis.setSocketClientInfo(socket.id, { RoomID: '', UserID: userInfo.userID, UserRole: userInfo.role })
	} catch (err) {
		next(new Error('Token authentication failed'))
	}
	next()
})

io.on('connection', socket => {
	socket.on('disconnect', async () => {
		const socketClientInfo = await redis.getSocketClientInfo(socket.id)
		if (!socketClientInfo || !socketClientInfo.UserRole) return socket.emit('error', 'Socket info not found')
		const ops = [redis.deleteSocketClientInfo(socket.id)]
		if (socketClientInfo.RoomID) {
			const userSocketIDField = getUserSocketIDField(getUserIDField(socketClientInfo.UserRole))
			ops.push(redis.deleteRoomInfoField(socketClientInfo.RoomID, userSocketIDField))
		}
		await Promise.all(ops)
	})
	socket.on('join-room', async (roomID: string) => {
		// Get socket client information
		const socketClientInfo = await redis.getSocketClientInfo(socket.id)
		if (!socketClientInfo || !socketClientInfo.UserRole || !socketClientInfo.UserID)
			return socket.emit('error', 'Socket info not found')

		const userIdField = getUserIDField(socketClientInfo.UserRole)
		const [expectedUserID] = await redis.getRoomInfo(roomID, userIdField)
		if (expectedUserID && expectedUserID != socketClientInfo.UserID) return socket.emit('error', 'Forbidden')

		await Promise.all([
			socket.join(roomID),
			redis.setSocketClientInfo(socket.id, { ...socketClientInfo, RoomID: roomID }),
			redis.setRoomInfo(roomID, getUserSocketIDField(userIdField), socket.id),
		])

		const isBothPeerJoined = await redis.isBothPeersJoined(roomID)
		if (isBothPeerJoined) {
			// Signal start-peering
			const isInitiator = getRandomBoolean()
			socket.to(roomID).emit('start-peering', isInitiator)
			socket.emit('start-peering', !isInitiator)
		}
	})

	socket.on('signal', async (data: any) => {
		const socketClientInfo = await redis.getSocketClientInfo(socket.id)
		if (!socketClientInfo || !socketClientInfo.RoomID) return socket.emit('error', 'Socket info not found')
		socket.to(socketClientInfo.RoomID).emit('signal', data)
	})

	socket.on('close-room', async () => {
		const socketClientInfo = await redis.getSocketClientInfo(socket.id)
		if (!socketClientInfo || !socketClientInfo.RoomID || !socketClientInfo.UserRole)
			return socket.emit('error', 'Socket info not found')
		if (socketClientInfo.UserRole.toLowerCase() != 'doctor')
			return socket.emit('error', 'Only doctor can close the room')
		socket.to(socketClientInfo.RoomID).emit('room-closed')
		io.in(socketClientInfo.RoomID).disconnectSockets(true)
	})
})

const getUserIDField = (role: string): RoomInfoField.PATIENT_ID | RoomInfoField.DOCTOR_ID => {
	if (role.toLowerCase() === 'patient') return RoomInfoField.PATIENT_ID
	return RoomInfoField.DOCTOR_ID
}

const getUserSocketIDField = (
	userIDField: RoomInfoField.PATIENT_ID | RoomInfoField.DOCTOR_ID
): RoomInfoField.PATIENT_SOCKET_ID | RoomInfoField.DOCTOR_SOCKET_ID => {
	if (userIDField === RoomInfoField.PATIENT_ID) return RoomInfoField.PATIENT_SOCKET_ID
	return RoomInfoField.DOCTOR_SOCKET_ID
}

const getRandomBoolean = (): boolean => Math.random() < 0.5

server.listen(env.Port, () => {
	console.log(`Server is running on port ${env.Port}`)
})
