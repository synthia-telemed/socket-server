import dotenv from 'dotenv'
import joi from 'joi'

interface ENV {
	Port: number
	RedisHost: string
	RedisPort: number
	RedisUsername: string
	RedisPassword: string
	HeimdallEndpoint: string
}

export const parseENV = (): ENV => {
	dotenv.config()
	const envSchema = joi
		.object()
		.keys({
			PORT: joi.number().default(3000),
			REDIS_HOST: joi.string().required(),
			REDIS_PORT: joi.number().default(6379),
			REDIS_USERNAME: joi.string().default(() => undefined),
			REDIS_PASSWORD: joi.string().default(() => undefined),
			HEIMDALL_ENDPOINT: joi.string().required(),
		})
		.unknown()

	const { value: envVars, error } = envSchema.prefs({ errors: { label: 'key' } }).validate(process.env)
	if (error) {
		throw new Error(`Config validation error: ${error.message}`)
	}
	return {
		Port: envVars.PORT,
		RedisHost: envVars.REDIS_HOST,
		RedisPort: envVars.REDIS_PORT,
		RedisUsername: envVars.REDIS_USERNAME,
		RedisPassword: envVars.REDIS_PASSWORD,
		HeimdallEndpoint: envVars.HEIMDALL_ENDPOINT,
	}
}
