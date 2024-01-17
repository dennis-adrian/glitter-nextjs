import { UserButton } from "@clerk/nextjs";

const Login = () => {
  return (
    <div className="h-screen">
      <UserButton afterSignOutUrl='/' />
    </div>
  )
}

export default Login;