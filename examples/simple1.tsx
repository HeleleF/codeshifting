/**
 * 1
 */
/* before */ import { ActivitySelectors } from "@client-core/lib/activity";

import { useSelector } from "react-redux";
import { View, ViewNeu } from "./lib.js"; // after
/**
 * 2
 */

// function A3({ activity: { id, lock } }: View) {
//   console.log(id);

//   return (
//     <div>
//       {lock}
//       {id}
//     </div>
//   );
// }

// test
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
