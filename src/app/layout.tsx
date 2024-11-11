import type { Metadata } from "next"
// import "./globals.css"
import DynamicProvider from "@/context/dynamic"
import { UserProvider } from "@/context/userContext"
import { NotificationProvider } from "@/context/notificationContext"

export const metadata: Metadata = {
    title: "Image Steganography",
    description: "Image Steganography - Hide messages in images securely",
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en" data-theme="lofi">
            <body className="">
                <NotificationProvider>
                    <UserProvider>
                        <DynamicProvider>
                            {children}
                            {/* <ThemeDropDown /> */}
                        </DynamicProvider>
                    </UserProvider>
                </NotificationProvider>
            </body>
        </html>
    )
}
