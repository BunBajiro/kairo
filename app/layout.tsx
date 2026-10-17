// The history bootstrap must run before hydration so browser Back/Forward owns
// workspace navigation from the first render. It emits only the static script
// from workspace-navigation.mjs, never pilot data or request-derived HTML.
import type { Metadata } from "next";
import "./globals.css";
import {workspaceHistoryBootstrap} from "../components/kairo/workspace-navigation.mjs";
export const metadata:Metadata={title:"Kairo · Capsuleer command centre",description:"Your local EVE Online command centre. Character intelligence, assets, training, industry and New Eden at a glance.",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" className="dark"><head><script id="kairo-workspace-history" dangerouslySetInnerHTML={{__html:workspaceHistoryBootstrap()}}/></head><body>{children}</body></html>}
