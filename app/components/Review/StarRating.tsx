import React from "react";

const StarIcon = ({ fill }: { fill: "full" | "half" | "empty" }) => {
  if (fill === "full") {
    return <span className="text-yellow-400">★</span>;
  }
  if (fill === "half") {
    return (
      <span className="relative inline-block">
        <span className="text-c-grey">★</span>
        <span
          className="absolute left-0 top-0 overflow-hidden text-yellow-400"
          style={{ width: "50%" }}
        >
          ★
        </span>
      </span>
    );
  }
  return <span className="text-c-grey">★</span>;
};

const getStarFill = (
  star: number,
  rating: number
): "full" | "half" | "empty" => {
  if (rating >= star) return "full";
  if (rating >= star - 0.5) return "half";
  return "empty";
};

export const StarDisplay = ({ rating }: { rating: number }) => {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className="relative inline-block text-sm leading-none">
          <StarIcon fill={getStarFill(star, rating)} />
        </span>
      ))}
      <span className="text-sh-grey ml-1 text-xs">{rating}</span>
    </div>
  );
};

export const StarSelector = ({
  rating,
  setRating,
}: {
  rating: number;
  setRating: (r: number) => void;
}) => {
  const [hover, setHover] = React.useState<number>(0);
  const display = hover || rating;

  const handleMouseMove = (
    e: React.MouseEvent<HTMLSpanElement>,
    star: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHover(x < rect.width / 2 ? star - 0.5 : star);
  };

  const handleClick = (
    e: React.MouseEvent<HTMLSpanElement>,
    star: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const val = x < rect.width / 2 ? star - 0.5 : star;
    setRating(rating === val ? 0 : val);
  };

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          className="relative inline-block cursor-pointer text-2xl leading-none select-none"
          onMouseMove={(e) => handleMouseMove(e, star)}
          onClick={(e) => handleClick(e, star)}
        >
          <StarIcon fill={getStarFill(star, display)} />
        </span>
      ))}
      {display > 0 && (
        <span className="text-sh-grey ml-1 text-sm">{display}</span>
      )}
    </div>
  );
};
