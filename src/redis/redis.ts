import Redis from 'ioredis'
import { threadId } from 'worker_threads'

export enum RoomInfoField {
	PATIENT_ID = 'PatientID',
	DOCTOR_ID = 'DoctorID',
	APPOINTMENT_ID = 'AppointmentID',
	STARTED_AT = 'StartedAt',
	DURATION = 'Duration',
	PATIENT_SOCKET_ID = 'PatientSocketID',
	DOCTOR_SOCKET_ID = 'DoctorSocketID',
}
export interface RoomInfo {
	patientID: string | null
	doctorID: string | null
	appointmentID: string | null
	startedAt: string | null
	patientSocketID: string | null
	doctorSocketID: string | null
}

export enum SocketClientInfoField {
	USER_ID = 'UserID',
	USER_ROLE = 'UserRole',
	ROOM_ID = 'RoomID',
}
export interface SocketClientInfo {
	UserID: string | null
	UserRole: string | null
	RoomID: string | null
}

export class RedisClient {
	private readonly client: Redis
	constructor(host: string, port: number, username?: string, password?: string) {
		this.client = new Redis({ host, username, password, port })
	}
	quit() {
		return this.client.quit()
	}

	private roomInfoKey(roomID: string): string {
		return `room:${roomID}`
	}
	async setRoomInfo(roomID: string, field: RoomInfoField, value: string): Promise<void> {
		await this.client.hset(this.roomInfoKey(roomID), { [field]: value })
	}
	async getRoomInfo(roomID: string, ...fields: RoomInfoField[]): Promise<(string | null)[]> {
		return this.client.hmget(this.roomInfoKey(roomID), ...fields)
	}
	async deleteRoomInfoField(roomID: string, field: RoomInfoField): Promise<void> {
		await this.client.hdel(this.roomInfoKey(roomID), field)
	}

	async isBothPeersJoined(roomID: string): Promise<boolean> {
		const key = this.roomInfoKey(roomID)
		const result = await Promise.all([
			this.client.hexists(key, RoomInfoField.PATIENT_SOCKET_ID),
			this.client.hexists(key, RoomInfoField.DOCTOR_SOCKET_ID),
		])
		return !result.some(v => v === 0)
	}

	private socketClientInfoKey(socketID: string): string {
		return `socket:${socketID}`
	}
	async setSocketClientInfo(socketID: string, info: SocketClientInfo): Promise<void> {
		await this.client.hmset(this.socketClientInfoKey(socketID), info)
	}
	async getSocketClientInfo(socketID: string): Promise<SocketClientInfo | null> {
		const res = await this.client.hmget(
			this.socketClientInfoKey(socketID),
			SocketClientInfoField.USER_ID,
			SocketClientInfoField.USER_ROLE,
			SocketClientInfoField.ROOM_ID
		)
		if (this.isAllEmpty(res)) return null
		return {
			UserID: res[0],
			UserRole: res[1],
			RoomID: res[2],
		}
	}
	async deleteSocketClientInfo(socketID: string): Promise<void> {
		await this.client.del(this.socketClientInfoKey(socketID))
	}

	private isAllEmpty(arr: Array<any>): boolean {
		return arr.every(v => !v)
	}
}
