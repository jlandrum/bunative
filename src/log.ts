import colors from 'colors';

export const Log = {
  verbosity: undefined as Verbosity,

  debug: (...data: any) => {
    (Log.verbosity?.length || 0) >= 4 ? console.log(colors.bold('[DEBUG]:'), ...data) : () => {};
  },

  log: (...data: any) => {
    (Log.verbosity?.length || 0) >= 3 ? console.log(colors.green('[LOG]:'), ...data) : () => {};
  },

  warn: (...data: any) => { 
    (Log.verbosity?.length || 0) >= 2 ? console.warn(colors.yellow('[WARN]:'), ...data) : () => {};
  },

  error: (...data: any) => {
    (Log.verbosity?.length || 0) >= 1 ? console.error(colors.red('[ERROR]:'),...data) : () => {};
  }
}

export default Log;