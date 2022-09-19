import { GenericContainer, StartedTestContainer } from 'testcontainers'
import Redis from 'ioredis'
import { nanoid } from 'nanoid'
import { RedisClient, RoomInfo, RoomInfoField } from './redis'

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
			const key = `room:${roomID}`
			val = [nanoid(), nanoid()]
			await client.hset(key, RoomInfoField.DOCTOR_ID, val[0], RoomInfoField.DOCTOR_SOCKET_ID, val[1])
		})

		it('should get room info', async () => {
			const retrievedVal = await redisClient.getRoomInfo(
				roomID,
				RoomInfoField.DOCTOR_ID,
				RoomInfoField.DOCTOR_SOCKET_ID
			)
			expect(retrievedVal).toEqual(val)
		})
	})
})
