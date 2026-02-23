import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-blue-800 mb-2">AMB FMB Niyaz Niyat</h1>
        <p className="text-gray-500 mb-6">Portal Admin</p>
        <Link href="/login">
          <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
            Go to Login
          </button>
        </Link>
      </div>
    </main>
  )
}