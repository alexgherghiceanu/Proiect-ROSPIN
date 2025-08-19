import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const register = async () => {
    try {
      const res = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("token", data.token || ""); // store token if backend returns one
        navigate("/dashboard"); // ✅ redirect after register
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert("Something went wrong!");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h2 className="text-2xl mb-4">Register</h2>
      <input
        type="text"
        placeholder="Username"
        className="border p-2 mb-2"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="border p-2 mb-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button
        onClick={register}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Register
      </button>
    </div>
  );
}