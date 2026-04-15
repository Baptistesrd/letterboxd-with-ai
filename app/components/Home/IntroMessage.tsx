import Link from "next/link";
import React from "react";

export const IntroMessage = ({ user }: { user: any }) => {
  return (
      <div className="text-h-grey text-center text-3xl font-normal">
        Welcome,{" "}
        <Link
          href={"/profile/" + user.uid}
          className="border-h-grey text-p-white hover:border-p-white border-b border-solid"
        >
          {user.displayName}
        </Link>
        .{" "}
        <span className="hidden pb-2 md:inline-block">
          Start your movie tracking journey now!
        </span>
      </div>
      
  );
};
