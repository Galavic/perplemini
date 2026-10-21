import React from 'react';
import { RobotHead } from 'robot-heads';

const labels={idle:'Ready to help',thinking:'Thinking',searching:'Researching',speaking:'Responding',error:'The response encountered an error'};

export function mascotState(message,busy){
  if(!busy)return message?.error?'error':'idle';
  if(message?.content)return 'speaking';
  if(message?.research?.steps?.length)return 'searching';
  return 'thinking';
}

export function Mascot({state='idle',compact=false,paused=false}){
  return <RobotHead className={`mascot ${compact?'mascot-compact':''}`} shape="square" state={state} size={compact?24:80} color="#151515" trimColor="#858b91" screenColor="#f2f4f5" antenna={!compact} floorShadow={!compact} interactive={false} paused={paused} aria-label={`Perplemini mascot: ${labels[state]}`} data-state={state}/>;
}
