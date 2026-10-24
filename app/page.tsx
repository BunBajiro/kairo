"use client";
// The client dashboard owns pilot selection, resources and the main EventSource;
// this entry adds no independent subscriptions. See docs/INTERNAL-API.md.
import Dashboard from "@/components/kairo/dashboard";
export default function Home(){return <Dashboard/>;}
