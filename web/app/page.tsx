import CreateRoom from '@/components/Home/CreateRoom';

export default function Home() {
  return (
    <main className="flex justify-center items-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
      <section className="flex flex-col items-center gap-10 p-8 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/30 max-w-md w-full">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-400 to-teal-500 rounded-2xl shadow-lg mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 tracking-tight">
            Start a{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-teal-600">
              Stream!
            </span>
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-md font-light">
            Create your broadcasting room with a single click
          </p>
        </div>
        <CreateRoom />
      </section>
    </main>
  );
}
