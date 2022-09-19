import { GenericContainer, StartedTestContainer } from 'testcontainers'
import Redis from 'ioredis'
import { nanoid } from 'nanoid'
import { RedisClient, RoomInfo, RoomInfoField, SocketClientInfo, SocketClientInfoField } from './redis'

describe('redis suite', () => {
	let redisContainer: StartedTestContainer
	let client: Redis
	let redisClient: RedisClient

	beforeAll(async () => {
		redisContainer = await new GenericContainer('redis:6-alpine').withExposedPorts(6379).start()
		const host = redisContainer.getHost()
		const port = redisContainer.getMappedPort(6379)
		client = new Redis({ host, port })
		redisClient = new RedisClient(host, port)
	}, 10000)

	afterAll(async () => {
		client.disconnect()
		await redisClient.quit()
		await redisContainer.stop()
	}, 10000)

	it('should set a field in the room info', async () => {
		const roomID = nanoid()
		const patientID = nanoid()
		await redisClient.setRoomInfo(roomID, RoomInfoField.PATIENT_ID, patientID)
		const val = await client.hget(`room:${roomID}`, RoomInfoField.PATIENT_ID)
		expect(val).toEqual(patientID)
	})

	describe('get room info', () => {
		let roomID: string
		let val: Array<string>
		beforeEach(async () => {
			roomID = nanoid()
			val = [nanoid(), nanoid()]
			await client.hset(`room:${roomID}`, RoomInfoField.DOCTOR_ID, val[0], RoomInfoField.DOCTOR_SOCKET_ID, val[1])
		})

		it('should get room info', async () => {
			const retrievedVal = await redisClient.getRoomInfo(
				roomID,
				RoomInfoField.DOCTOR_ID,
				RoomInfoField.DOCTOR_SOCKET_ID
			)
			expect(retrievedVal).toEqual(val)
		})
		it('should return null when not found', async () => {
			const retrievedVal = await redisClient.getRoomInfo(
				nanoid(),
				RoomInfoField.DOCTOR_ID,
				RoomInfoField.DOCTOR_SOCKET_ID
			)
			expect(retrievedVal).toEqual([null, null])
		})
	})

	describe('isBothPeersJoined function', () => {
		it('should return true when both peer socket id are set', async () => {
			const roomID = nanoid()
			await client.hmset(`room:${roomID}`, {
				[RoomInfoField.PATIENT_SOCKET_ID]: nanoid(),
				[RoomInfoField.DOCTOR_SOCKET_ID]: nanoid(),
			})
			const isBoth = await redisClient.isBothPeersJoined(roomID)
			expect(isBoth).toBeTruthy()
		})
		it('should return false when both only one peer socket id is set', async () => {
			const roomID = nanoid()
			await client.hmset(`room:${roomID}`, {
				[RoomInfoField.PATIENT_SOCKET_ID]: nanoid(),
			})
			const isBoth = await redisClient.isBothPeersJoined(roomID)
			expect(isBoth).toBeFalsy()
		})
		it('should return false when no peer socket is set', async () => {
			const roomID = nanoid()
			const isBoth = await redisClient.isBothPeersJoined(roomID)
			expect(isBoth).toBeFalsy()
		})
	})

	it('should set socket client info', async () => {
		const socketID = nanoid()
		const info: SocketClientInfo = generateSocketClientInfo()
		await redisClient.setSocketClientInfo(socketID, info)
		const retrievedVals = await client.hmget(
			`socket:${socketID}`,
			SocketClientInfoField.USER_ID,
			SocketClientInfoField.USER_ROLE,
			SocketClientInfoField.ROOM_ID
		)
		expect(retrievedVals).toEqual([info.UserID, info.UserRole, info.RoomID])
	})

	describe('get socket client info', () => {
		let socketID: string, info: SocketClientInfo
		beforeEach(async () => {
			socketID = nanoid()
			info = generateSocketClientInfo()
			await client.hset(`socket:${socketID}`, info)
		})
		it('should get socket client info', async () => {
			const retrievedInfo = await redisClient.getSocketClientInfo(socketID)
			expect(retrievedInfo).toEqual(info)
		})
		it('should get null when not found', async () => {
			const retrievedInfo = await redisClient.getSocketClientInfo(nanoid())
			expect(retrievedInfo).toBeNull()
		})
	})

	describe('delete socketClientInfo', () => {
		let socketID: string
		beforeEach(async () => {
			socketID = nanoid()
			await client.hset(`socket:${socketID}`, generateSocketClientInfo())
		})
		it('should delete socketClientInfo', async () => {
			await redisClient.deleteSocketClientInfo(socketID)
			const vals = await client.hmget(
				`socket:${socketID}`,
				SocketClientInfoField.ROOM_ID,
				SocketClientInfoField.USER_ID,
				SocketClientInfoField.USER_ROLE
			)
			expect(vals.every(v => !v)).toBeTruthy()
		})
	})

	describe('delete RoomInfo field', () => {
		let roomID: string,
			delKey = RoomInfoField.DOCTOR_SOCKET_ID
		beforeEach(async () => {
			roomID = nanoid()
			await client.hset(`room:${roomID}`, { [delKey]: nanoid() })
		})
		it('should delete field in RoomInfo', async () => {
			await redisClient.deleteRoomInfoField(roomID, delKey)
			const exist = await client.hexists(`room:${roomID}`, delKey)
			expect(exist).toBeFalsy()
		})
	})
})

function generateSocketClientInfo(): SocketClientInfo {
	return {
		RoomID: nanoid(),
		UserID: nanoid(),
		UserRole: nanoid(),
	}
}
