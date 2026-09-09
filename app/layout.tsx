import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Kairo · Capsuleer command centre",description:"Your local EVE Online command centre. Character intelligence, assets, training, industry and New Eden at a glance.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" className="dark"><body>{children}</body></html>}
