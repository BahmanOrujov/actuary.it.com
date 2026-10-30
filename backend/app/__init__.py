"""Portfel Analizi backend.

Runs before numpy is imported anywhere (every entry point imports this package first): OpenBLAS otherwise
reserves ~700 MB of commit per process on a many-core machine for thread buffers we never use (matrices
here are small and parallelism is per process). With an API, two workers and their process pools that
exhausted Windows' commit limit, and other programs (the browser) failed to allocate memory.
Set the variables yourself to override."""
import os

for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")
