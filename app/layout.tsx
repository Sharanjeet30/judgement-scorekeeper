import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata={title:'Judgement Scorekeeper',description:'Single-table scorekeeper for Judgement (Oh Hell)'};
export default function RootLayout({children}:{children:React.ReactNode}){return(<html lang='en'><body className='min-h-screen antialiased transition-colors'>{children}</body></html>);}
