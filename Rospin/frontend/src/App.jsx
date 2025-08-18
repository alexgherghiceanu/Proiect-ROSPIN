import { useState } from "react";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const register = async () => {
  try {
    const res = await fetch("http://localhost:5000/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok) {
      alert(data.message); // "User registered!"
    } else {
      alert(data.error); // e.g., "Username already exists"
    }
  } catch (err) {
    console.error(err);
    alert("Something went wrong!");
  }
};

  const login = async () => {
    const res = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("token", data.token);
      alert("Logged in!");
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 mt-10">
      <input
        type="text"
        placeholder="Username"
        className="border p-2 rounded"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        className="border p-2 rounded"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={register} className="bg-blue-500 text-white px-4 py-2 rounded">
          Register
        </button>
        <button onClick={login} className="bg-green-500 text-white px-4 py-2 rounded">
          Login
        </button>
      </div>
    </div>
  );
}

export default App;