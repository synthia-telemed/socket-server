import Redis from 'ioredis'

type GetNullableValue = Promise<string | null>
enum RoomInfoField {
	PATIENT_ID = 'PatientID',
	DOCTOR_ID = 'DoctorID',
	APPOINTMENT_ID = 'AppointmentID',
	STARTED_AT = 'StartedAt',
	PATIENT_SOCKET_ID = 'PatientSocketID',
	DOCTOR_SOCKET_ID = 'DoctorSocketID',
}

export class RedisClient {
	private readonly client: Redis
	constructor(host: string, port: number, username?: string, password?: string) {
		this.client = new Redis({ host, username, password, port })
	}

	private async set(key: string, value: string, expiredIn: number = 86400): Promise<'OK'> {
		return this.client.setex(key, expiredIn, value)
	}

	private roomOfSocketKey(socketID: string): string {
		return `${socketID}:room_id`
	}
	private roomInfoKey(roomID: string): string {
		return `room:${roomID}`
	}

	async setRoomOfSocket(socketID: string, roomID: string): Promise<void> {
		await this.set(this.roomOfSocketKey(socketID), roomID)
	}

	async getRoomOfSocket(socketID: string): GetNullableValue {
		return this.client.get(this.roomOfSocketKey(socketID))
	}

	async getRoomInfo(roomID: string, field: RoomInfoField): GetNullableValue {
		return this.client.hget(this.roomInfoKey(roomID), field)
	}
}
