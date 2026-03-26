import { getProjectInfo } from './wwise/getProjectInfo'
import { findObjects } from './wwise/findObjects'
import { getObject } from './wwise/getObject'
import { getChildren } from './wwise/getChildren'
import { setProperty } from './wwise/setProperty'
import { getSelectedObjects } from './wwise/getSelectedObjects'

/**
 * All tools available to the LLM.
 * To add a new tool: create the file in ./wwise/, import and add it here.
 */
export const allTools = {
  getProjectInfo,
  findObjects,
  getObject,
  getChildren,
  setProperty,
  getSelectedObjects,
}
