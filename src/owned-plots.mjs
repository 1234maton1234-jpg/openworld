export function minePlots(mine){
  if(Array.isArray(mine?.plots))return mine.plots;
  return mine?.plot?[mine.plot]:[];
}

export const primaryPlot=mine=>minePlots(mine)[0]||null;
export function remainingPlotClaims(mine){
  const limit=Number.isSafeInteger(mine?.plotLimit)&&mine.plotLimit>=0?mine.plotLimit:1;
  return Math.max(0,limit-minePlots(mine).length);
}
