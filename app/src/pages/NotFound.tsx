import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Result, Button } from "antd";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <Result
      status="404"
      title="404"
      subTitle={`No page for ${location.pathname}`}
      extra={
        <Link to="/">
          <Button type="primary">Return home</Button>
        </Link>
      }
    />
  );
};

export default NotFound;
