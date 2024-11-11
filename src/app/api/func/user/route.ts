export const dynamic = "force-dynamic"
import { User } from "../../../../library/auth"
import prisma from "../../../../library/prisma/db"

export async function GET(request: Request) {
    try {
        const userInfoCookie = request.headers
            .get("cookie")
            ?.split("; ")
            .find((row) => row.startsWith("user="))
            ?.split("=")[1]

        if (!userInfoCookie) {
            return new Response(JSON.stringify({ error: "No user info available" }), {
                status: 401,
                headers: {
                    "Content-Type": "application/json",
                },
            })
        }

        const userInfo = decodeURIComponent(userInfoCookie)
        try {
            const user: User = JSON.parse(userInfo)
            await prisma.user.upsert({
                where: { walletAddress: user.walletAddress },
                create: {
                    email: user.email ? user.email : null,
                    walletAddress: user.walletAddress,
                    username: null,
                    dynamic_id: user.id,
                },
                update: {
                    lastSeemAt: new Date(),
                },
                select: {
                    id: true,
                    email: true,
                    createdAt: true,
                    lastSeemAt: true,
                    dynamic_id: true,
                },
            })

            return new Response(JSON.stringify({ user }), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                },
            })
        } catch (error) {
            return new Response(JSON.stringify({ error: "Invalid user info format" }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                },
            })
        }
    } catch (error) {
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
            },
        })
    }
}
