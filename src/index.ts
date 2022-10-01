import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { HeimdallClient, UserInfo } from './api/heimdall'
import { parseENV } from './env'
import { RedisClient, RoomInfoField, SocketClientInfoField } from './redis/redis'
dayjs.extend(utc)

const env = parseENV()
const redis = new RedisClient(env.RedisHost, env.RedisPort, env.RedisUsername, env.RedisPassword)
const heimdallClient = new HeimdallClient(env.HeimdallEndpoint)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: '*',
	},
	transports: ['websocket'],
})

app.get('/healthcheck', (req, res) => {
	res.send({
		success: true,
		timestamp: new Date().toISOString(),
	})
})

io.use(async (socket, next) => {
	const { token } = socket.handshake.auth
	if (!token) next(new Error('Auth token is not found'))
	try {
		const userInfo = await heimdallClient.parseToken(token)
		await redis.setSocketClientInfo(socket.id, { RoomID: '', UserID: userInfo.userID, UserRole: userInfo.role })
	} catch (err) {
		console.error(err)
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
			socket.to(socketClientInfo.RoomID).emit('user-left')
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

		const userSocketIDField = getUserSocketIDField(userIdField)
		await Promise.all([
			socket.join(roomID),
			redis.setSocketClientInfo(socket.id, { ...socketClientInfo, RoomID: roomID }),
			redis.setRoomInfo(roomID, userSocketIDField, socket.id),
		])

		const otherUserSocketIDField = getOtherUserSocketIDField(userSocketIDField)
		const [otherUserSocketID, startedAt] = await redis.getRoomInfo(
			roomID,
			otherUserSocketIDField,
			RoomInfoField.STARTED_AT
		)
		if (otherUserSocketID) {
			if (!startedAt) await redis.setRoomInfo(roomID, RoomInfoField.STARTED_AT, dayjs.utc().toISOString())
			const isInitiator = getRandomBoolean()
			io.to(otherUserSocketID).emit('start-peering', isInitiator)
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
		const [startedTime] = await redis.getRoomInfo(socketClientInfo.RoomID, RoomInfoField.STARTED_AT)
		if (!startedTime) return socket.emit('error', 'Room is not started')
		const duration = dayjs.utc().diff(dayjs.utc(startedTime), 'second')
		await redis.setRoomInfo(socketClientInfo.RoomID, RoomInfoField.DURATION, duration.toString())

		io.in(socketClientInfo.RoomID).emit('room-closed', duration)
		io.in(socketClientInfo.RoomID).disconnectSockets(true)
	})
})

type UserIDField = RoomInfoField.PATIENT_ID | RoomInfoField.DOCTOR_ID
const getUserIDField = (role: string): UserIDField => {
	if (role.toLowerCase() === 'patient') return RoomInfoField.PATIENT_ID
	return RoomInfoField.DOCTOR_ID
}

type UserSocketIDField = RoomInfoField.PATIENT_SOCKET_ID | RoomInfoField.DOCTOR_SOCKET_ID
const getUserSocketIDField = (userIDField: UserIDField): UserSocketIDField => {
	return userIDField === RoomInfoField.PATIENT_ID ? RoomInfoField.PATIENT_SOCKET_ID : RoomInfoField.DOCTOR_SOCKET_ID
}

const getOtherUserSocketIDField = (userSocketIDField: UserSocketIDField): UserSocketIDField => {
	return userSocketIDField === RoomInfoField.PATIENT_SOCKET_ID
		? RoomInfoField.DOCTOR_SOCKET_ID
		: RoomInfoField.PATIENT_SOCKET_ID
}

const getRandomBoolean = (): boolean => Math.random() > 0.5

server.listen(env.Port, () => {
	console.log(`Server is running on port ${env.Port}`)
})
