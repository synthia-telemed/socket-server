import axios, { AxiosInstance } from 'axios'

export interface UserInfo {
	userID: string
	role: string
}

export class HeimdallClient {
	private readonly api: AxiosInstance
	constructor(baseURL: string) {
		this.api = axios.create({ baseURL })
	}

	async parseToken(token: string): Promise<UserInfo> {
		const { data } = await this.api.get('/auth/body', {
			headers: {
				Authorization: token,
			},
		})
		return {
			userID: data.user_id,
			role: data.role.toLowerCase(),
		}
	}
}
