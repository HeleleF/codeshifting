import { ActivitySelectors } from "@client-core/lib/activity";
import { View, ViewNeu } from "./lib.js";
import { useSelector } from "react-redux";

// function A3({ activity: { id, lock } }: View) {
//   console.log(id);

//   return (
//     <div>
//       {lock}
//       {id}
//     </div>
//   );
// }

function A3({ activityId }: View) {
  const { id, lock } = useSelector(ActivitySelectors.activityById(activityId))!;
  console.log(id);

  return (
    <div>
      {lock}
      {id}
    </div>
  );
}
