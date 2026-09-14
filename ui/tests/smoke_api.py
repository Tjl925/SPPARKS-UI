"""Manual integration check against a running local service: python -B tests/smoke_api.py."""
import json
import time
import urllib.request
import urllib.error

BASE='http://127.0.0.1:8765'


def call(path, data=None):
    req=urllib.request.Request(BASE+path, data=json.dumps(data).encode() if data is not None else None,
                               headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=15) as response:
        return json.load(response)


if __name__=='__main__':
    assert {m['id'] for m in call('/api/models')} == {'potts','ising','thin_film'}
    for bad in [{'modelId':'unknown','parameters':{}}, {'modelId':'ising','parameters':{'states':4}}]:
        try:
            call('/api/jobs',bad)
            raise AssertionError('Invalid payload accepted')
        except urllib.error.HTTPError as exc:
            assert exc.code==400
    for model_id in ('potts','ising','thin_film'):
        demo=call('/api/demo/'+model_id)
        assert demo['modelId']==model_id and len(demo['frames'])==11
        p={'size':16,'duration':1e10} if model_id=='thin_film' else {'size':8,'duration':10}
        job=call('/api/jobs',{'modelId':model_id,'parameters':p})
        deadline=time.monotonic()+200
        while job['status']=='running' and time.monotonic()<deadline:
            time.sleep(1)
            job=call('/api/jobs/'+job['id'])
        assert job['status']=='complete',job
        result=call('/api/jobs/'+job['id']+'/result')
        assert result['modelId']==model_id
        assert len(result['frames'])==11
        assert all(f['energy'] is not None for f in result['frames'])
        print(model_id,job['id'],len(result['ids']),'sites',len(result['frames']),'frames',flush=True)
    print('All model dispatch and validation checks passed.',flush=True)
