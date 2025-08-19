import { Link } from "react-router-dom";

export default function App() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-4xl font-bold mb-6">Welcome to Rospin 🚀</h1>
      <p className="mb-8 text-lg text-gray-600">
        Please login or register to continue.
      </p>
      <div className="space-x-4">
        <Link
          to="/login"
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          Login
        </Link>
        <Link
          to="/register"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Register
        </Link>
      </div>
    </div>
  );
}
