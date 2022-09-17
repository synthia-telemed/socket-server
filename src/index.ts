import express from "express"

const app = express()
const PORT = 3000 || process.env.PORT

app.get("/healthcheck", (req, res) => {
	res.send({
		success: true,
		timestamp: new Date().toISOString()
	})
})

app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`)
})
